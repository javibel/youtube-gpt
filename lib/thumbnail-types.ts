export const THUMB_W = 1312;
export const THUMB_H = 736;

export interface PhotoItem {
  src: string;   // object URL or blob URL
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface TextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontStyle: string;   // '' | 'bold' | 'italic' | 'bold italic'
  rotation: number;
}
