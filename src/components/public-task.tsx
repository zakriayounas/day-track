"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PublicTaskData = {
  reference: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  due_date: string | null;
  tags: string[];
  body: string;
  test_steps: string;
  created_at: string;
  updated_at: string;
  reminder_at: string | null;
  reminder_repeat: string | null;
  assignee: string | null;
  creator: string | null;
  release: string | null;
  platforms: string[];
  comments: PublicTaskComment[];
};

type PublicTaskComment = { id: string; author_name: string; body: string; created_at: string };

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatDueDate(value: string | null): string {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Not set";
}

export default function PublicTask({ task, token }: { task: PublicTaskData; token: string }) {
  const [comments, setComments] = useState(task.comments);
  const [guestName, setGuestName] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const addComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = guestName.trim();
    const body = commentBody.trim();
    if (!name || !body) return;
    const client = createClient();
    if (!client) {
      setErrorMessage("Comments are temporarily unavailable. Please try again later.");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { data, error } = await client.rpc("add_public_item_comment", {
        share_token: token,
        guest_name: name,
        comment_body: body,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      if (!data || typeof data !== "object" || !("id" in data) || !("created_at" in data)) {
        setErrorMessage("The comment could not be confirmed. Refresh the page before trying again.");
        return;
      }
      const saved = data as PublicTaskComment;
      setComments((existing) => [...existing, saved]);
      setCommentBody("");
    } catch (error) {
      console.error("Could not add public task comment", error);
      setErrorMessage("Could not send your comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="public-page">
      <header className="public-top"><Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link><span className="public-task-shared">Shared task · Read only</span></header>
      <article className="public-task-layout">
        <div className="public-task-main">
          <header className="public-task-heading">
            <div className="eyebrow">{task.reference}</div>
            <h1>{task.title}</h1>
            <div className="public-task-labels">
              <span className="public-task-status">{task.status.replaceAll("_", " ")}</span>
              <span className="public-task-priority">{task.priority} priority</span>
              {task.tags.map((tag) => <span className="public-task-tag" key={tag}>#{tag}</span>)}
            </div>
          </header>
          <section className="public-task-section">
            <h2>Description</h2>
            <p className="public-task-prose">{task.body || "No description provided."}</p>
          </section>
          <section className="public-task-section">
            <h2>Test steps for QA</h2>
            <p className="public-task-prose">{task.test_steps.trim() || "No QA test steps provided yet."}</p>
          </section>
        </div>
        <aside className="public-task-details-card">
          <h2>Task details</h2>
          <dl className="public-task-details">
            <div><dt>Type</dt><dd>{task.type.replaceAll("_", " ")}</dd></div>
            <div><dt>Assignee</dt><dd>{task.assignee || "Unassigned"}</dd></div>
            <div><dt>Created by</dt><dd>{task.creator || "Unknown"}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(task.created_at)}</dd></div>
            <div><dt>Due date</dt><dd>{formatDueDate(task.due_date)}</dd></div>
            <div><dt>Release</dt><dd>{task.release || "Not linked"}</dd></div>
            <div><dt>Platforms</dt><dd>{task.platforms.length ? task.platforms.join(", ") : "Not set"}</dd></div>
            <div><dt>Reminder</dt><dd>{task.reminder_at ? `${formatDate(task.reminder_at)}${task.reminder_repeat && task.reminder_repeat !== "none" ? ` · Repeats ${task.reminder_repeat}` : ""}` : "None"}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(task.updated_at)}</dd></div>
          </dl>
        </aside>
        <section className="public-task-comments-section">
          <div className="public-task-comments-heading"><h2>Comments</h2><span className="public-task-comment-count">{comments.length}</span></div>
          {comments.length > 0 ? <div className="public-task-comments">{comments.map((comment) => <article className="public-task-comment" key={comment.id}><div><b>{comment.author_name}</b><time dateTime={comment.created_at}>{formatDate(comment.created_at)}</time></div><p>{comment.body}</p></article>)}</div> : <p className="public-task-empty-comments">No comments yet</p>}
          <form className="public-task-comment-form" onSubmit={(event) => void addComment(event)}>
            <label className="form-label" htmlFor="guest-name">Your name<input id="guest-name" autoComplete="name" maxLength={80} required value={guestName} onChange={(event) => setGuestName(event.target.value)} /></label>
            <label className="form-label" htmlFor="guest-comment">Comment<textarea id="guest-comment" maxLength={5000} rows={4} required value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Write a comment about this task..." /></label>
            {errorMessage && <p className="public-task-error" role="alert">{errorMessage}</p>}
            <button className="primary-button" type="submit" disabled={submitting || !guestName.trim() || !commentBody.trim()}>{submitting ? "Sending..." : "Post Comment"}</button>
          </form>
        </section>
      </article>
      <footer className="public-footer">Shared with DayTrack <span>·</span> Built for teams that ship</footer>
    </main>
  );
}
