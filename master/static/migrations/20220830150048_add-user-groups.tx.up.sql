CREATE TABLE groups (
    id integer unique NOT NULL,
    group_name text unique NOT NULL,
    user_id integer REFERENCES users (id) ON DELETE CASCADE NULL
);

ALTER TABLE groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE user_group_membership (
    user_id integer REFERENCES users (id) ON DELETE CASCADE,
    group_id integer REFERENCES groups (id) ON DELETE CASCADE,

    PRIMARY KEY (user_id, group_id)
);
