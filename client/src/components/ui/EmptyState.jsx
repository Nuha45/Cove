export default function EmptyState({ title, text, action }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {text ? <p>{text}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
