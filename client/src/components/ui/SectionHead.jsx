import { ChevronRight } from 'lucide-react';

export default function SectionHead({ title, action, onAction }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action ? (
        <button className="text-button" type="button" onClick={onAction}>
          {action}
          <ChevronRight size={15} />
        </button>
      ) : null}
    </div>
  );
}
