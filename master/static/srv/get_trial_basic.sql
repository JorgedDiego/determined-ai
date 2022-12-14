SELECT
    t.id,
    t.experiment_id,
    'STATE_' || t.state AS state,
    t.start_time,
    t.end_time,
    t.hparams,
    t.runner_state
FROM trials t
WHERE t.id = $1
