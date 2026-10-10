-- Extend fresh shared admission to automatic transitions; preserve all rows.
ALTER TABLE ab_test_mutation_attempts DROP CONSTRAINT ab_test_mutation_attempts_action_check;
ALTER TABLE ab_test_mutation_attempts ADD CONSTRAINT ab_test_mutation_attempts_action_check
  CHECK (action IN ('cancel','apply_winner','switch_variant','complete_test'));
