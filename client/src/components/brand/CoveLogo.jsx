export default function CoveLogo({ withName = true, size = 28 }) {
  return (
    <span className="cove-logo">
      <img src="/cove-mark.png" alt="" width={size} height={size} />
      {withName ? <span className="cove-logo-name">Cove</span> : null}
    </span>
  );
}
