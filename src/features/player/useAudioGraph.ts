import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type AudioGraph = {
  context: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
};

export const useAudioGraph = (audioRef: RefObject<HTMLAudioElement | null>) => {
  const graphRef = useRef<AudioGraph | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return null;
    if (!graphRef.current) {
      const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      const context = new AudioCtor();
      const source = context.createMediaElementSource(audio);
      const nextAnalyser = context.createAnalyser();
      nextAnalyser.fftSize = 2048;
      nextAnalyser.smoothingTimeConstant = 0.84;
      nextAnalyser.minDecibels = -88;
      nextAnalyser.maxDecibels = -12;
      source.connect(nextAnalyser);
      nextAnalyser.connect(context.destination);
      graphRef.current = { context, source, analyser: nextAnalyser };
      setAnalyser(nextAnalyser);
    }
    if (graphRef.current.context.state !== 'running') await graphRef.current.context.resume();
    return graphRef.current;
  }, [audioRef]);

  useEffect(() => () => {
    const context = graphRef.current?.context;
    if (context && context.state !== 'closed') void context.close();
  }, []);

  return { analyser, ensureAudioGraph };
};
