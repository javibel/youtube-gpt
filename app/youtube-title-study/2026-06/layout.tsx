import type { Metadata } from 'next';

// Versión archivada (27/06/2026, N=1.814) — coincide con un vídeo ya grabado que cita estos
// números exactos. La página madre en /youtube-title-study se refrescó el 09/07 con un dataset
// nuevo (N=1.723); esta ruta existe para no romper esa referencia. noindex para no competir
// con la página madre como activo citable — ver [[project_title_study]].
export const metadata: Metadata = {
  title: 'Anatomía de un título de YouTube: análisis de 1.814 vídeos (versión archivada)',
  description:
    'Versión archivada (27/06/2026) del estudio de títulos de YouTube. Para los datos actualizados, ver /youtube-title-study.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://ytubviral.com/youtube-title-study/2026-06' },
};

export default function StudyArchiveLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
