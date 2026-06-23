'use client';

// Loaded only via dynamic import (ssr: false) — Konva requires window/document.
import { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Transformer, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { THUMB_W, THUMB_H, type PhotoItem, type TextItem } from '@/lib/thumbnail-types';

interface Props {
  containerWidth: number;
  backgroundUrl: string | null;
  photo: PhotoItem | null;
  texts: TextItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdatePhoto: (updates: Partial<PhotoItem>) => void;
  onUpdateText: (id: string, updates: Partial<TextItem>) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

function useLoadedImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload  = () => setImg(i);
    i.onerror = () => setImg(null);
    i.src = src;
    return () => { i.onload = null; i.onerror = null; };
  }, [src]);
  return img;
}

export default function ThumbnailCanvasInner({
  containerWidth,
  backgroundUrl,
  photo,
  texts,
  selectedId,
  onSelect,
  onUpdatePhoto,
  onUpdateText,
  stageRef,
}: Props) {
  const scale       = containerWidth / THUMB_W;
  const displayH    = Math.round(THUMB_H * scale);

  const bgImage     = useLoadedImage(backgroundUrl);
  const photoImage  = useLoadedImage(photo?.src ?? null);

  const transformerRef = useRef<Konva.Transformer | null>(null);
  const photoNodeRef   = useRef<Konva.Image | null>(null);
  const textNodeRefs   = useRef<Map<string, Konva.Text>>(new Map());

  // Attach Transformer to selected node whenever selection/data changes
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;

    let node: Konva.Node | null = null;
    if (selectedId === 'photo' && photoNodeRef.current) {
      node = photoNodeRef.current;
    } else if (selectedId) {
      node = textNodeRefs.current.get(selectedId) ?? null;
    }

    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, photo, texts]);

  const handleStageTap = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === (e.target as Konva.Node).getStage()) onSelect(null);
  };

  const isPhotoSelected = selectedId === 'photo';

  return (
    <Stage
      ref={stageRef as React.RefObject<Konva.Stage>}
      width={containerWidth}
      height={displayH}
      onClick={handleStageTap}
      onTap={handleStageTap}
    >
      <Layer scaleX={scale} scaleY={scale}>

        {/* Background — fills full canvas */}
        {bgImage ? (
          <KonvaImage
            image={bgImage}
            x={0} y={0}
            width={THUMB_W} height={THUMB_H}
            listening={false}
          />
        ) : (
          /* Placeholder until background is set */
          <>
            <Rect x={0} y={0} width={THUMB_W} height={THUMB_H} fill="#111111" listening={false} />
            <KonvaText
              x={0} y={THUMB_H / 2 - 18}
              width={THUMB_W}
              text="Generate or upload a background to start"
              align="center"
              fontSize={28}
              fill="rgba(255,255,255,0.25)"
              fontFamily="Arial"
              listening={false}
            />
          </>
        )}

        {/* User photo */}
        {photo && photoImage && (
          <KonvaImage
            ref={photoNodeRef}
            image={photoImage}
            x={photo.x}
            y={photo.y}
            width={photo.width}
            height={photo.height}
            opacity={photo.opacity}
            draggable
            onClick={(e) => { e.cancelBubble = true; onSelect('photo'); }}
            onTap={(e)   => { e.cancelBubble = true; onSelect('photo'); }}
            onDragEnd={(e) => onUpdatePhoto({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Image;
              onUpdatePhoto({
                x:      Math.round(node.x()),
                y:      Math.round(node.y()),
                width:  Math.round(node.width()  * node.scaleX()),
                height: Math.round(node.height() * node.scaleY()),
              });
              node.scaleX(1);
              node.scaleY(1);
            }}
          />
        )}

        {/* Text layers */}
        {texts.map((t) => (
          <KonvaText
            key={t.id}
            ref={(node) => {
              if (node) textNodeRefs.current.set(t.id, node);
              else       textNodeRefs.current.delete(t.id);
            }}
            text={t.text}
            x={t.x}
            y={t.y}
            width={t.width}
            fontSize={t.fontSize}
            fontFamily={t.fontFamily}
            fill={t.fill}
            stroke={t.strokeWidth > 0 ? t.stroke : undefined}
            strokeWidth={t.strokeWidth > 0 ? t.strokeWidth : undefined}
            fontStyle={t.fontStyle || undefined}
            rotation={t.rotation}
            draggable
            onClick={(e) => { e.cancelBubble = true; onSelect(t.id); }}
            onTap={(e)   => { e.cancelBubble = true; onSelect(t.id); }}
            onDragEnd={(e) => onUpdateText(t.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
            onTransformEnd={(e) => {
              const node = e.target as Konva.Text;
              onUpdateText(t.id, {
                x:        Math.round(node.x()),
                y:        Math.round(node.y()),
                fontSize: Math.max(8, Math.round(t.fontSize * node.scaleY())),
                width:    Math.max(50, Math.round(t.width   * node.scaleX())),
                rotation: node.rotation(),
              });
              node.scaleX(1);
              node.scaleY(1);
            }}
          />
        ))}

        {/* Transformer — shown on the selected element */}
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio={isPhotoSelected}
          enabledAnchors={
            isPhotoSelected
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
          }
          boundBoxFunc={(old, box) => (box.width < 20 || box.height < 20 ? old : box)}
        />
      </Layer>
    </Stage>
  );
}
