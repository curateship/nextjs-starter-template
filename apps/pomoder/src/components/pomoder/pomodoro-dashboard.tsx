import * as React from "react"
import { Link, useRouteContext } from "@tanstack/react-router"
import { Check, Plus, RotateCcw, X } from "lucide-react"

import { usePomodoro } from "@/hooks/use-pomodoro"
import type { TimerMode } from "@/lib/pomodoro"

const modeLabels: Record<TimerMode, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

const modeHints: Record<TimerMode, string> = {
  focus: "Silence the noise. One task, nothing else, until the ring closes.",
  short: "Step away from the screen. Stretch, breathe, refill the glass.",
  long: "You earned it. A proper pause before the next block of four.",
}

const circumference = 2 * Math.PI * 132

export function PomodoroDashboard() {
  const { user } = useRouteContext({ from: "__root__" })
  const pomodoro = usePomodoro(Boolean(user))
  const [taskTitle, setTaskTitle] = React.useState("")
  const minutes = Math.floor(pomodoro.remainingSeconds / 60)
  const seconds = pomodoro.remainingSeconds % 60
  const totalSeconds = pomodoro.timer.durationMinutes * 60
  const dashOffset = circumference * (1 - pomodoro.remainingSeconds / totalSeconds)
  const completedTasks = pomodoro.tasks.filter((task) => task.completed).length

  return (
    <div className="reference-dashboard">
      <section className="dashboard-timer-section">
        <div className="dashboard-timer-wrap">
          <div className="dashboard-ring">
            <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
              <circle cx="150" cy="150" r="132" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10" />
              <circle
                cx="150"
                cy="150"
                r="132"
                fill="none"
                stroke={pomodoro.timer.running ? "#4ADE80" : "#FF5A3C"}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 150 150)"
              />
            </svg>
            <div className="dashboard-ring-content">
              <time>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</time>
              <button className="dashboard-start" onClick={pomodoro.toggleTimer}>{pomodoro.timer.running ? "Pause" : "Start"}</button>
              <button className="dashboard-reset" onClick={pomodoro.reset} aria-label="Reset timer"><RotateCcw aria-hidden="true" /></button>
            </div>
          </div>

          <div className="dashboard-controls">
            <div className="dashboard-modes" role="tablist" aria-label="Timer mode">
              {(Object.keys(modeLabels) as TimerMode[]).map((mode) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={pomodoro.timer.mode === mode}
                  className={pomodoro.timer.mode === mode ? "active" : ""}
                  onClick={() => pomodoro.selectMode(mode)}
                >
                  {modeLabels[mode]}
                </button>
              ))}
            </div>
            <p>{modeHints[pomodoro.timer.mode]}</p>
            <div className="dashboard-session-count">
              <div aria-label={`${pomodoro.focusSessions} of 4 sessions complete`}>
                {[0, 1, 2, 3].map((index) => <i key={index} className={index < pomodoro.focusSessions % 4 ? "filled" : ""} />)}
              </div>
              <span>{pomodoro.focusSessions} {pomodoro.focusSessions === 1 ? "session" : "sessions"} completed today</span>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-panel-section">
        <div className="dashboard-tasks">
          <header><strong>Tasks</strong><span>{completedTasks} / {pomodoro.tasks.length} done</span></header>
          <div className="dashboard-task-list">
            {pomodoro.tasks.map((task) => (
              <div className="dashboard-task" key={task.id}>
                <button className={task.completed ? "completed" : ""} onClick={() => pomodoro.toggleTask(task.id)} aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}>
                  {task.completed ? <Check aria-hidden="true" /> : null}
                </button>
                <span className={task.completed ? "completed" : ""}>{task.title}</span>
                <button className="remove-task" onClick={() => pomodoro.removeTask(task.id)} aria-label={`Remove ${task.title}`}><X aria-hidden="true" /></button>
              </div>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); pomodoro.addTask(taskTitle); setTaskTitle("") }}>
            <Plus aria-hidden="true" />
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} placeholder="Add a task, press Enter…" aria-label="New task" />
          </form>
        </div>
      </section>

      <section className="dashboard-panel-section room-preview-section">
        <div className="dashboard-room-preview">
          <header><i /><strong>Focus room</strong><span>Work quietly with others</span><Link to="/rooms">Browse rooms</Link></header>
          <p>Join a shared timer whenever you want quiet company while you focus.</p>
        </div>
      </section>
    </div>
  )
}
