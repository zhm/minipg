DROP VIEW IF EXISTS test_view;
DROP TABLE IF EXISTS test_table;

CREATE TABLE test_table (t1 text, t2 bigint);

INSERT INTO test_table (t1, t2)
SELECT v, v FROM generate_series(1, 21) AS v;

CREATE OR REPLACE VIEW test_view AS
SELECT t1 AS v1, t2 AS v2 FROM test_table;

SELECT v1, v2 FROM test_view;

SELECT v1, v2, v1 FROM test_view;
