import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  songKey?: string | null;
  artworkUrl?: string | null;
}

interface AudioPlayerState {
  currentTrack: Track | null;
  playlist: Track[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffled: boolean;
  repeatMode: 'off' | 'all' | 'one';
  isExpanded: boolean;
  audioLevel: number;
}

interface AudioPlayerContextType extends AudioPlayerState {
  play: (track?: Track, startTime?: number) => void;
  pause: () => void;
  togglePlay: () => void;
  setPlaylist: (tracks: Track[], startIndex?: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setExpanded: (expanded: boolean) => void;
  playTrackFromPlaylist: (index: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  // Single audio element - simpler approach without Web Audio API for better compatibility
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    playlist: [],
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isShuffled: false,
    repeatMode: 'off',
    isExpanded: false,
    audioLevel: 0,
  });

  // Use refs for state values needed in callbacks to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // Simpler audio level estimation without Web Audio API (avoids pops/cracks)
  const updateAudioLevel = useCallback(() => {
    if (stateRef.current.isPlaying) {
      // Simulate audio level based on playback (simpler, no audio graph issues)
      const simulatedLevel = 0.3 + Math.random() * 0.4;
      setState(prev => ({ ...prev, audioLevel: simulatedLevel }));
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, []);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = "auto";

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setState(prev => ({ ...prev, currentTime: audio.currentTime }));
    };

    const handleDurationChange = () => {
      setState(prev => ({ ...prev, duration: audio.duration || 0 }));
    };

    const handleEnded = () => {
      const { playlist, currentTrack, repeatMode, isShuffled } = stateRef.current;
      
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(console.error);
        return;
      }
      
      const currentIndex = playlist.findIndex(t => t.id === currentTrack?.id);
      let nextIndex = currentIndex + 1;
      
      if (isShuffled) {
        nextIndex = Math.floor(Math.random() * playlist.length);
      }
      
      if (nextIndex < playlist.length) {
        const nextTrack = playlist[nextIndex];
        audio.src = nextTrack.audioUrl;
        audio.play().catch(console.error);
        setState(prev => ({ ...prev, currentTrack: nextTrack, currentTime: 0 }));
      } else if (repeatMode === 'all' && playlist.length > 0) {
        const firstTrack = playlist[0];
        audio.src = firstTrack.audioUrl;
        audio.play().catch(console.error);
        setState(prev => ({ ...prev, currentTrack: firstTrack, currentTime: 0 }));
      } else {
        setState(prev => ({ ...prev, isPlaying: false, currentTime: 0, audioLevel: 0 }));
      }
    };

    const handlePlay = () => {
      setState(prev => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false, audioLevel: 0 }));
    };

    // Handle errors gracefully - try to recover
    const handleError = (e: Event) => {
      console.warn('Audio error, attempting recovery:', e);
      const currentTrack = stateRef.current.currentTrack;
      if (currentTrack && audio.src) {
        // Try to reload and play
        setTimeout(() => {
          audio.load();
          if (stateRef.current.isPlaying) {
            audio.play().catch(console.error);
          }
        }, 1000);
      }
    };

    // Handle stalled/waiting events
    const handleStalled = () => {
      console.warn('Audio stalled, attempting recovery');
      if (stateRef.current.isPlaying && audio.paused) {
        audio.play().catch(console.error);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('waiting', handleStalled);

    // Handle visibility changes - resume playback when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // If we were playing but audio got paused, try to resume
        if (stateRef.current.isPlaying && audio.paused) {
          audio.play().catch(console.error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('waiting', handleStalled);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      audio.pause();
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update audio level animation
  useEffect(() => {
    if (state.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isPlaying, updateAudioLevel]);

  const play = useCallback((track?: Track, startTime?: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (track) {
      audio.src = track.audioUrl;
      setState(prev => ({ ...prev, currentTrack: track, currentTime: startTime || 0 }));
      
      // If startTime provided, seek after audio is ready
      if (startTime && startTime > 0) {
        const handleCanPlay = () => {
          audio.currentTime = startTime;
          audio.removeEventListener('canplay', handleCanPlay);
        };
        audio.addEventListener('canplay', handleCanPlay);
      }
    }
    
    audio.play().catch(console.error);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    if (stateRef.current.isPlaying) {
      pause();
    } else if (stateRef.current.currentTrack) {
      audioRef.current?.play().catch(console.error);
    }
  }, [pause]);

  const setPlaylist = useCallback((tracks: Track[], startIndex = 0) => {
    setState(prev => ({ ...prev, playlist: tracks }));
    if (tracks.length > 0 && tracks[startIndex]) {
      play(tracks[startIndex]);
    }
  }, [play]);

  const playTrackFromPlaylist = useCallback((index: number) => {
    if (stateRef.current.playlist[index]) {
      play(stateRef.current.playlist[index]);
    }
  }, [play]);

  const nextTrack = useCallback(() => {
    const { playlist, currentTrack, isShuffled } = stateRef.current;
    const currentIndex = playlist.findIndex(t => t.id === currentTrack?.id);
    let nextIndex: number;

    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = (currentIndex + 1) % playlist.length;
    }

    if (playlist[nextIndex]) {
      play(playlist[nextIndex]);
    }
  }, [play]);

  const previousTrack = useCallback(() => {
    const audio = audioRef.current;
    
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    const { playlist, currentTrack } = stateRef.current;
    const currentIndex = playlist.findIndex(t => t.id === currentTrack?.id);
    const prevIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;

    if (playlist[prevIndex]) {
      play(playlist[prevIndex]);
    }
  }, [play]);

  const skipForward = useCallback((seconds = 15) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.min(audio.currentTime + seconds, audio.duration || 0);
    }
  }, []);

  const skipBackward = useCallback((seconds = 15) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(audio.currentTime - seconds, 0);
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    setState(prev => ({ ...prev, volume }));
  }, []);

  const toggleShuffle = useCallback(() => {
    setState(prev => ({ ...prev, isShuffled: !prev.isShuffled }));
  }, []);

  const toggleRepeat = useCallback(() => {
    setState(prev => {
      const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
      const currentIndex = modes.indexOf(prev.repeatMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      return { ...prev, repeatMode: nextMode };
    });
  }, []);

  const setExpanded = useCallback((expanded: boolean) => {
    setState(prev => ({ ...prev, isExpanded: expanded }));
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        ...state,
        play,
        pause,
        togglePlay,
        setPlaylist,
        nextTrack,
        previousTrack,
        skipForward,
        skipBackward,
        seekTo,
        setVolume,
        toggleShuffle,
        toggleRepeat,
        setExpanded,
        playTrackFromPlaylist,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}

// Safe version that returns null instead of throwing
export function useAudioPlayerSafe() {
  return useContext(AudioPlayerContext);
}
