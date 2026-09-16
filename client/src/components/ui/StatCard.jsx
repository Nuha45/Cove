export default function StatCard({ icon: Icon, label, value, change, color }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-icon" style={{ background: color }}>
          <Icon size={18} />
        </span>
        <span className="change neutral">{change}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
