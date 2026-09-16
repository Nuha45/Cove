import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { navItems } from '../routes/navItems';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import { formatEyebrowDate } from '../utils/display';

export default function PlaceholderPage() {
  const { pathname } = useLocation();
  const { notify } = useOutletContext();
  const [note, setNote] = useState('');
  const item = navItems.find((nav) => nav.to === pathname);

  if (!item) return null;

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title={item.label}
        subtitle={item.subtitle}
        action={
          item.label === 'Products' ? (
            <button
              className="primary"
              type="button"
              onClick={() => {
                setNote('Adding products is the next step. This button is ready for that.');
                notify('Adding products comes next.');
              }}
            >
              <Plus size={17} /> Add product
            </button>
          ) : null
        }
      />
      {note ? <p className="inline-note">{note}</p> : null}
      <section className="card empty-card">
        <Badge tone="orange">Coming next</Badge>
        <EmptyState title={item.emptyTitle} text={item.emptyText} />
      </section>
    </>
  );
}
