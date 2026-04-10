// TreeFork — SVG split/merge connector for branch points.
// "split": one line divides into multiple paths
// "merge": multiple paths converge into one

import { type ReactElement, type ReactNode } from 'react';

interface TreeForkProps {
  type: 'split' | 'merge';
  branchCount: number;
  children: ReactNode;
}

export function TreeFork({ type, branchCount, children }: TreeForkProps): ReactElement {
  return (
    <div className={`tree-fork tree-fork--${type}`}>
      <svg className="tree-fork-svg" viewBox={`0 0 300 60`} preserveAspectRatio="none">
        {type === 'split' ? renderSplit(branchCount) : renderMerge(branchCount)}
      </svg>
      <div className="tree-fork-branches">{children}</div>
      {type === 'split' && null}
    </div>
  );
}

function renderSplit(count: number): ReactElement {
  // Bezier curves from center-top to evenly spaced bottom points
  const cx = 150; // center x
  const paths: ReactElement[] = [];

  for (let i = 0; i < count; i++) {
    const endX = count === 1 ? cx : (i / (count - 1)) * 260 + 20;
    const cp1x = cx;
    const cp1y = 25;
    const cp2x = endX;
    const cp2y = 35;
    paths.push(
      <path
        key={i}
        d={`M ${cx} 0 C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} 60`}
        className="tree-fork-line"
        fill="none"
      />,
    );
  }

  return <>{paths}</>;
}

function renderMerge(count: number): ReactElement {
  const cx = 150;
  const paths: ReactElement[] = [];

  for (let i = 0; i < count; i++) {
    const startX = count === 1 ? cx : (i / (count - 1)) * 260 + 20;
    const cp1x = startX;
    const cp1y = 25;
    const cp2x = cx;
    const cp2y = 35;
    paths.push(
      <path
        key={i}
        d={`M ${startX} 0 C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${cx} 60`}
        className="tree-fork-line"
        fill="none"
      />,
    );
  }

  return <>{paths}</>;
}
