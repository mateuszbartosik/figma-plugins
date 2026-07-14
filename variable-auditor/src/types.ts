export type Scope = 'selection' | 'page' | 'document';

// Filter buckets shown as chips in the UI.
export type HardcodedCategory = 'color' | 'radiusStroke' | 'spacing' | 'typography';

// Finer per-property kind (drives value key + label).
export type HardcodedKind =
  | 'color' | 'radius' | 'strokeWeight' | 'spacing'
  | 'fontSize' | 'lineHeight' | 'letterSpacing';

export type VariableResolvedType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';

export interface RGBA { r: number; g: number; b: number; a: number } // channels 0..1

export interface Occurrence {
  nodeId: string;
  nodeName: string;
  pageId: string;
  pageName: string;
  category: HardcodedCategory;
  kind: HardcodedKind;
  field: string;          // figma field to bind: 'fills' | 'strokes' | 'cornerRadius' | 'topLeftRadius' | 'strokeWeight' | 'paddingLeft' | 'itemSpacing' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'fills[gradientStop]' | 'strokes[gradientStop]' | 'effects' | ...
  paintIndex?: number;    // for color occurrences: index in fills/strokes
  valueKey: string;       // grouping key, e.g. 'color:#FFFFFF@1' or 'radius:8'
  colorHex?: string;      // '#RRGGBB' for color
  opacity?: number;       // 0..1 for color
  num?: number;           // numeric value for non-color kinds
  replaceable?: boolean;  // default true (solid fill/stroke); false for gradient-stop and shadow-effect colors — navigate-only in v1
}

export interface HardcodedGroup {
  category: HardcodedCategory;
  kind: HardcodedKind;
  valueKey: string;
  label: string;          // e.g. '#FFFFFF' or 'Corner radius · 8'
  colorHex?: string;
  opacity?: number;
  num?: number;
  count: number;
  occurrences: Occurrence[];
}

export interface UnusedVariable {
  id: string;
  name: string;
  collectionName: string;
  resolvedType: VariableResolvedType;
  valuePreview: string;   // '#2B5CE6' or '40'
  colorHex?: string;      // for swatch when COLOR
}

export interface BrokenReference {
  nodeId: string;
  nodeName: string;
  pageId: string;
  pageName: string;
  field: string;
  variableId: string;     // the missing id
}

export interface UnlinkedRef {
  nodeId: string;
  nodeName: string;
  pageId: string;
  pageName: string;
  field: string;
  variableName: string;
  collectionName: string;
  collectionKey: string;
}

export interface UnlinkedGroup {
  collectionKey: string;
  collectionName: string;
  count: number;
  refs: UnlinkedRef[];
}

export interface ScanSummary { unused: number; broken: number; hardcoded: number; unlinked: number }

export interface ScanResult {
  scope: Scope;
  summary: ScanSummary;
  unused: UnusedVariable[];
  broken: BrokenReference[];
  hardcoded: HardcodedGroup[];
  unlinked: UnlinkedGroup[];
}

export interface CandidateVariable {
  id: string;
  name: string;
  collectionName: string;
  exact: boolean;
  valuePreview: string;
  colorHex?: string;
  near?: boolean;
}

// A published library variable, not yet imported into this file. Unlike
// CandidateVariable (local), there is no valuePreview: the Plugin API only exposes
// name/key/resolvedType for library variables — the actual value is only knowable
// after importVariableByKeyAsync brings it into the file.
export interface LibraryCandidate {
  key: string;
  name: string;
  collectionName: string;
  resolvedType: VariableResolvedType;
}

export interface Checks { unused: boolean; broken: boolean; hardcoded: boolean; unlinked: boolean }

export interface HardcodedProps { color: boolean; radius: boolean; strokeWeight: boolean; spacing: boolean; typography: boolean }

export type UIToPlugin =
  | { type: 'scan'; scope: Scope }
  | { type: 'set-scope'; scope: Scope }
  | { type: 'set-checks'; checks: Checks; props: HardcodedProps }
  | { type: 'navigate'; nodeId: string; pageId: string }
  | { type: 'detach'; nodeId: string; field: string }
  | { type: 'get-candidates'; category: HardcodedCategory; valueKey: string }
  | { type: 'replace'; category: HardcodedCategory; valueKey: string; variableId?: string; libraryKey?: string }
  | { type: 'delete-variables'; ids: string[] };

export type PluginToUI =
  | { type: 'scan-progress'; scanned: number }
  | { type: 'scan-result'; result: ScanResult }
  | { type: 'settings'; checks: Checks; props: HardcodedProps }
  | { type: 'candidates'; category: HardcodedCategory; valueKey: string; local: CandidateVariable[]; library: LibraryCandidate[] }
  | { type: 'action-result'; ok: boolean; message: string;
      removedVariableIds?: string[]; replacedValueKey?: string; replacedCount?: number; skippedCount?: number }
  | { type: 'error'; message: string };
