export type TechniqueName =
  | 'naked_single'
  | 'hidden_single'
  | 'locked_candidates'
  | 'naked_pair'
  | 'hidden_pair'
  | 'naked_triple'
  | 'hidden_triple'
  | 'x_wing'
  | 'finned_x_wing'
  | 'skyscraper'
  | 'xy_wing'
  | 'xyz_wing'
  | 'w_wing'
  | 'unique_rectangle'
  | 'x_cycle_simple_coloring'
  | 'swordfish'
  | 'finned_swordfish'
  | 'remote_pairs'
  | 'two_string_kite'
  | 'empty_rectangle'
  | 'bug_plus_one'
  | 'jellyfish'
  | 'finned_jellyfish'
  | 'aic'
  | 'aic_mid_chain'
  | 'grouped_aic_nice_loop'
  | 'aic_long_chain'
  | 'als_xz'
  | 'als_chain'
  | 'forcing_chain_net'
  | 'exocet_death_blossom'
  | 'xy_chain'
  | 'discontinuous_nice_loop'
  | 'cell_forcing_chain'
  | 'region_forcing_chain'
  | 'template'
  | 'als_xy'
  | 'als_w_wing'
  | 'sue_de_coq'
  | 'death_blossom'
  | 'medusa_3d';

export type ActionKind = 'fill' | 'eliminate';

export interface DetectionAction {
  kind: ActionKind;
  cell: number; // 0-80
  digit: number; // 1-9
}

export interface DetectionResult {
  technique: TechniqueName;
  actions: DetectionAction[];
  patternCells: number[];
  description: string;
}

export type DetectorFn = (board: import('./board').SolverBoard) => DetectionResult | null;
