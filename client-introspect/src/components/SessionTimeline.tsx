import { useEffect, useState, type FormEvent } from 'react'
import type { RecordingHeader, RecordingSummary, ReplayPosition, SessionMode } from '../hooks/useIntrospectSocket'

interface SessionTimelineProps {
  connected: boolean
  mode: SessionMode
  recording: boolean
  recordings: RecordingSummary[]
  replayHeader: RecordingHeader | undefined
  replayPosition: ReplayPosition | undefined
  replayPlaying: boolean
  onStartRecording: (name?: string) => void
  onStopRecording: () => void
  onRefreshRecordings: () => void
  onLoadRecording: (id: string) => void
  onStepForward: () => void
  onStepBackward: () => void
  onJumpToCheckpoint: (checkpointIndex: number) => void
  onPlay: () => void
  onPause: () => void
  onExitReplay: () => void
}

function RecordToggle({ recording, onStart, onStop }: { recording: boolean; onStart: (name?: string) => void; onStop: () => void }) {
  const [name, setName] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onStart(name.trim() || undefined)
    setName('')
  }

  if (recording) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md font-medium bg-red-600 hover:bg-red-500 text-white"
      >
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        Stop recording
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Recording name (optional)"
        className="flex-1 rounded-md bg-gray-800 border border-gray-700 px-2 py-1 text-xs outline-none focus:border-indigo-500"
      />
      <button type="submit" className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md font-medium bg-gray-800 hover:bg-gray-700 text-gray-200">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Record
      </button>
    </form>
  )
}

function RecordingsList({ recordings, onLoad }: { recordings: RecordingSummary[]; onLoad: (id: string) => void }) {
  if (recordings.length === 0) {
    return <p className="text-xs text-gray-600">No recordings yet.</p>
  }
  return (
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {recordings.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onLoad(r.id)}
          className="w-full text-left text-xs px-2 py-1 rounded bg-gray-800/60 hover:bg-gray-800 text-gray-300 flex justify-between gap-2"
        >
          <span className="truncate">{r.name}</span>
          <span className="text-gray-500 shrink-0">{r.checkpointCount} checkpoints</span>
        </button>
      ))}
    </div>
  )
}

function ReplayScrubber({
  header,
  position,
  playing,
  onStepForward,
  onStepBackward,
  onJumpToCheckpoint,
  onPlay,
  onPause,
}: {
  header: RecordingHeader | undefined
  position: ReplayPosition | undefined
  playing: boolean
  onStepForward: () => void
  onStepBackward: () => void
  onJumpToCheckpoint: (checkpointIndex: number) => void
  onPlay: () => void
  onPause: () => void
}) {
  const total = position?.total ?? 0
  const index = position?.index ?? -1
  const atStart = index <= 0
  const atEnd = total === 0 || index >= total - 1
  // `total` counts every low-level protocol event (each streamed response
  // token is its own event, plus internal bookkeeping) — not chat messages,
  // so surface the checkpoint (one per turn) as the headline number and keep
  // the raw count as a secondary detail, to avoid it reading as a bug.
  const checkpointNumber = header ? header.checkpoints.filter((cp) => cp.index <= index).length : 0

  return (
    <div className="space-y-2">
      <div className="relative h-6 bg-gray-800 rounded overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-indigo-600/40"
          style={{ width: total > 0 ? `${((index + 1) / total) * 100}%` : '0%' }}
        />
        {header?.checkpoints.map((cp, i) => (
          <button
            key={`${cp.commitHash}-${cp.index}`}
            type="button"
            title={`Checkpoint ${i + 1}`}
            onClick={() => onJumpToCheckpoint(i)}
            className="absolute top-0 h-full w-1.5 bg-emerald-400 hover:bg-emerald-300"
            style={{ left: total > 1 ? `${(cp.index / (total - 1)) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onStepBackward}
          disabled={atStart}
          className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
        >
          ⏮ Prev
        </button>
        {playing ? (
          <button type="button" onClick={onPause} className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700">
            ⏸ Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            disabled={atEnd}
            className="text-xs px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
          >
            ▶ Play
          </button>
        )}
        <button
          type="button"
          onClick={onStepForward}
          disabled={atEnd}
          className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
        >
          Next ⏭
        </button>
        <span className="text-xs text-gray-500 tabular-nums" title={`Raw event ${total > 0 ? index + 1 : 0} of ${total}`}>
          Turn {checkpointNumber} / {header?.checkpoints.length ?? 0}
        </span>
      </div>
    </div>
  )
}

export function SessionTimeline(props: SessionTimelineProps) {
  const { connected, onRefreshRecordings, mode, recording } = props
  useEffect(() => {
    // The WebSocket connects asynchronously in a parent hook's own effect,
    // which — since child effects run before a parent's — hasn't necessarily
    // opened yet the first time this effect fires. Wait for `connected`
    // before sending, and re-fire once it flips true.
    if (!connected) return
    onRefreshRecordings()
  }, [connected, onRefreshRecordings, mode, recording])

  if (props.mode === 'replay') {
    return (
      <div className="border-t border-gray-800 p-3 bg-gray-900/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
            Replaying: {props.replayHeader?.name ?? '…'}
          </span>
          <button type="button" onClick={props.onExitReplay} className="text-xs text-gray-400 hover:text-white shrink-0">
            Exit replay
          </button>
        </div>
        <ReplayScrubber
          header={props.replayHeader}
          position={props.replayPosition}
          playing={props.replayPlaying}
          onStepForward={props.onStepForward}
          onStepBackward={props.onStepBackward}
          onJumpToCheckpoint={props.onJumpToCheckpoint}
          onPlay={props.onPlay}
          onPause={props.onPause}
        />
      </div>
    )
  }

  return (
    <div className="border-t border-gray-800 p-3 bg-gray-900/50 space-y-2">
      <RecordToggle recording={props.recording} onStart={props.onStartRecording} onStop={props.onStopRecording} />
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Recordings</h4>
        <RecordingsList recordings={props.recordings} onLoad={props.onLoadRecording} />
      </div>
    </div>
  )
}
