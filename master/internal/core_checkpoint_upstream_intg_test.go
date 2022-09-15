//go:build integration && upstream
// +build integration,upstream

package internal

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/google/uuid"

	"github.com/determined-ai/determined/master/internal/db"
	"github.com/determined-ai/determined/master/pkg/etc"
	"github.com/determined-ai/determined/master/pkg/ptrs"
	"github.com/determined-ai/determined/master/pkg/schemas"
	"github.com/determined-ai/determined/master/pkg/schemas/expconf"

	"github.com/labstack/echo/v4"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/determined-ai/determined/master/pkg/model"
)

const (
	S3_TEST_BUCKET = "storage-unit-tests"
	S3_TEST_PREFIX = "master/checkpoint-download"
)

var mockCheckpointContent = map[string]string{
	"emptyDir": "",
	"data.txt": "This is mock data.",
	// This long string must be longer than delayWriter.delayBytes
	"lib/big-data.txt": genLongString(1024 * 64),
	"lib/math.py":      "def triple(x):\n  return x * 3",
	"print.py":         `print("hello")`,
}

func genLongString(approxLength int) string {
	const block = "12345678223456783234567842345678\n"
	var sb strings.Builder

	for j := 0; j < approxLength; j += len(block) {
		sb.WriteString(block)
	}
	return sb.String()
}

func createMockCheckpointS3(bucket string, prefix string) error {
	region, err := getS3BucketRegion(context.TODO(), bucket)
	if err != nil {
		return err
	}
	sess, err := session.NewSession(&aws.Config{
		Region: &region,
	})
	if err != nil {
		return err
	}
	s3client := s3.New(sess)

	for k, v := range mockCheckpointContent {
		_, err = s3client.PutObject(&s3.PutObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(prefix + "/" + k),
			Body:   aws.ReadSeekCloser(strings.NewReader(v)),
		})
		if err != nil {
			return err
		}
	}

	return nil
}

func checkTgz(t *testing.T, content io.Reader, id string) {
	zr, err := gzip.NewReader(content)
	require.NoError(t, err, "failed to create a gzip reader")
	tr := tar.NewReader(zr)
	gotMap := make(map[string]string)
	prefix := S3_TEST_PREFIX + "/" + id + "/"
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break // End of archive
		}
		require.NoError(t, err, "failed to read record header")
		pathname := strings.TrimPrefix(hdr.Name, prefix)
		buf := &strings.Builder{}
		if hdr.Size > 0 {
			_, err := io.Copy(buf, tr)
			_, err = io.Copy(os.Stdout, tr)
			require.NoError(t, err, "failed to read content of file", hdr.Name)
		}
		gotMap[pathname] = buf.String()
	}
	require.Equal(t, mockCheckpointContent, gotMap)
}

func checkZip(t *testing.T, content string, id string) {
	zr, err := zip.NewReader(strings.NewReader(content), int64(len(content)))
	require.NoError(t, err, "failed to create a zip reader")
	gotMap := make(map[string]string)
	prefix := S3_TEST_PREFIX + "/" + id + "/"
	for _, f := range zr.File {
		pathname := strings.TrimPrefix(f.Name, prefix)
		buf := &strings.Builder{}
		rc, err := f.Open()
		require.NoError(t, err, "unable to decompress file", f.Name)
		_, err = io.Copy(buf, rc)
		require.NoError(t, err, "unable to read content of file", f.Name)
		rc.Close()
		gotMap[pathname] = buf.String()
	}
	require.Equal(t, mockCheckpointContent, gotMap)
}

func addMockCheckpointDB(t *testing.T, pgDB *db.PgDB, id uuid.UUID) {
	etc.SetRootPath(db.RootFromDB)
	user := db.RequireMockUser(t, pgDB)
	// Using a different path than DefaultTestSrcPath since we are one level up than most db tests
	exp := mockExperimentS3(t, pgDB, user, "../../examples/tutorials/mnist_pytorch")
	tr := db.RequireMockTrial(t, pgDB, exp)
	allocation := db.RequireMockAllocation(t, pgDB, tr.TaskID)
	// Create checkpoints
	checkpoint := db.MockModelCheckpoint(id, tr, allocation)
	err := pgDB.AddCheckpointMetadata(context.TODO(), &checkpoint)
	require.NoError(t, err)
}

func createCheckpoint(t *testing.T, pgDB *db.PgDB) (string, error) {
	id := uuid.New()
	addMockCheckpointDB(t, pgDB, id)
	err := createMockCheckpointS3(S3_TEST_BUCKET, S3_TEST_PREFIX+"/"+id.String())
	return id.String(), err
}

func newEchoContext() (echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	rec := httptest.NewRecorder()
	return e.NewContext(nil, rec), rec
}

func TestGetCheckpointEcho(t *testing.T) {
	var id string
	cases := []struct {
		DenyFuncName string
		IDToReqCall  func(id string) error
		Params       []any
	}{
		{"CanGetCheckpointTgz", func(id string) error {
			api, _, _ := SetupCheckpointTestEcho(t)
			id, err := createCheckpoint(t, api.m.db)
			if err != nil {
				return err
			}
			ctx, rec := newEchoContext()
			ctx.SetParamNames("checkpoint_uuid")
			ctx.SetParamValues(id)
			ctx.SetRequest(httptest.NewRequest(http.MethodGet, "/tgz", nil))
			err = api.m.getCheckpointTgz(ctx)
			checkTgz(t, rec.Body, id)
			return err
		}, []any{mock.Anything, mock.Anything}},
		{"CanGetCheckpointZip", func(id string) error {
			api, _, _ := SetupCheckpointTestEcho(t)
			id, err := createCheckpoint(t, api.m.db)
			if err != nil {
				return err
			}
			ctx, rec := newEchoContext()
			ctx.SetParamNames("checkpoint_uuid")
			ctx.SetParamValues(id)
			ctx.SetRequest(httptest.NewRequest(http.MethodGet, "/zip", nil))
			err = api.m.getCheckpointZip(ctx)
			checkZip(t, rec.Body.String(), id)
			return err
		}, []any{mock.Anything, mock.Anything}},
	}

	for _, curCase := range cases {
		require.NoError(t, curCase.IDToReqCall(id))
	}
}

func mockExperimentS3(t *testing.T, pgDB *db.PgDB, user model.User, folderPath string) *model.Experiment {
	cfg := schemas.WithDefaults(expconf.ExperimentConfigV0{
		RawCheckpointStorage: &expconf.CheckpointStorageConfigV0{
			RawS3Config: &expconf.S3ConfigV0{
				RawBucket: aws.String(S3_TEST_BUCKET),
				RawPrefix: aws.String(S3_TEST_PREFIX),
			},
		},
		RawEntrypoint: &expconf.EntrypointV0{
			RawEntrypoint: ptrs.Ptr("model.Classifier"),
		},
		RawHyperparameters: map[string]expconf.HyperparameterV0{
			"global_batch_size": {
				RawConstHyperparameter: &expconf.ConstHyperparameterV0{
					RawVal: ptrs.Ptr(1),
				},
			},
		},
		RawSearcher: &expconf.SearcherConfigV0{
			RawSingleConfig: &expconf.SingleConfigV0{
				RawMaxLength: &expconf.LengthV0{
					Unit:  expconf.Batches,
					Units: 1,
				},
			},
			RawMetric: ptrs.Ptr("okness"),
		},
	}).(expconf.ExperimentConfigV0)

	exp := model.Experiment{
		JobID:                model.NewJobID(),
		State:                model.ActiveState,
		Config:               cfg,
		ModelDefinitionBytes: db.ReadTestModelDefiniton(t, folderPath),
		StartTime:            time.Now().Add(-time.Hour),
		OwnerID:              &user.ID,
		Username:             user.Username,
		ProjectID:            1,
	}
	err := pgDB.AddExperiment(&exp)
	require.NoError(t, err, "failed to add experiment")
	return &exp
}
