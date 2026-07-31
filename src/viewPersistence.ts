export type PersistentViewMode =
  | 'seoAudit'
  | 'mediaWorkspace'
  | 'blogWorkspace'
  | 'pagePlanner'
  | 'productSeo'
  | 'blogAi'
  | 'blogFormat'
  | 'mediaOps';

export const PERSISTENT_VIEW_MODES: PersistentViewMode[] = [
  'seoAudit',
  'mediaWorkspace',
  'blogWorkspace',
  'pagePlanner',
  'productSeo',
  'blogAi',
  'blogFormat',
  'mediaOps',
];

export const shouldPersistViewMode = (mode: string): mode is PersistentViewMode => (
  PERSISTENT_VIEW_MODES.includes(mode as PersistentViewMode)
);

export const getNextVisitedPersistentModes = <T extends string>(
  visitedModes: Set<T>,
  mode: T,
) => {
  if (!shouldPersistViewMode(mode)) return visitedModes;
  if (visitedModes.has(mode)) return visitedModes;
  const next = new Set(visitedModes);
  next.add(mode);
  return next;
};

export const shouldRenderPersistentView = <T extends string>(
  visitedModes: Set<T>,
  mode: T,
  activeMode: T,
) => mode === activeMode || visitedModes.has(mode);
