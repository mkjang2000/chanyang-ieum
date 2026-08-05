import React from 'react';
import {
  CircleStop, CornerUpLeft, Music2, Pause, Play, Repeat2, RotateCcw,
  SkipForward, TrendingUp, Volume1,
} from 'lucide-react';

const ICONS = {
  'circle-stop': CircleStop,
  'rotate-ccw': RotateCcw,
  'repeat-2': Repeat2,
  'music-2': Music2,
  'skip-forward': SkipForward,
  'corner-up-left': CornerUpLeft,
  play: Play,
  pause: Pause,
  'volume-1': Volume1,
  'trending-up': TrendingUp,
};

export default function FlowSignalIcon({ name, ...props }) {
  const Icon = ICONS[name] || Music2;
  return <Icon {...props}/>;
}
