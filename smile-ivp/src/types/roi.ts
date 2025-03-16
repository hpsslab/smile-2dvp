export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ROIObject {
  'object-id': string;
  annotation: string;
  geometry: Geometry;
}

export interface FrameRange {
  'start-time': number;
  'end-time': number;
  objects: ROIObject[];
}

export interface ROIData {
  frames: FrameRange[];
} 