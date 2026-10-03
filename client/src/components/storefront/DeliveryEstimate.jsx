import { Truck } from 'lucide-react';
import { ESTIMATE_DISCLAIMER } from '../../utils/deliveryEstimate';

export default function DeliveryEstimate({ estimate, className = '' }) {
  if (!estimate?.text) return null;
  return (
    <div className={`delivery-estimate ${className}`.trim()}>
      <Truck size={18} aria-hidden="true" />
      <div>
        <span className="delivery-estimate-label">Estimated delivery</span>
        <strong>{estimate.text}</strong>
        {estimate.note ? <p>{estimate.note}</p> : null}
        <small>{ESTIMATE_DISCLAIMER}</small>
      </div>
    </div>
  );
}
