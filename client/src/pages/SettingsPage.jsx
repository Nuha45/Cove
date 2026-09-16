import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import { formatEyebrowDate, initials } from '../utils/display';

const tabs = [
  'Business profile',
  'Store appearance',
  'Payments & delivery',
  'Notifications',
  'Team & access',
];

export default function SettingsPage() {
  const { business } = useAuth();
  const { notify } = useOutletContext();
  const [tab, setTab] = useState(tabs[0]);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Settings"
        subtitle="Manage your settings in one simple place."
      />
      <section className="settings-grid">
        <div className="settings-nav card">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'selected' : ''}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === 'Business profile' ? (
          <section className="card settings-form">
            <div className="form-heading">
              <div>
                <h2>Business profile</h2>
                <p className="muted">This information appears on your storefront. Editing comes in the next step.</p>
              </div>
              <button className="primary" type="button" onClick={() => notify('Editing your profile comes in the next step.')}>
                Save changes
              </button>
            </div>
            <div className="logo-upload">
              <div className="logo-circle">{initials(business?.name, 1)}</div>
              <div>
                <strong>Business logo</strong>
                <p className="muted">PNG or JPG, up to 2MB</p>
              </div>
              <button className="secondary" type="button" onClick={() => notify('Logo upload comes in the next step.')}>Upload new</button>
            </div>
            <div className="form-grid">
              <label>
                Business name
                <input readOnly value={business?.name || ''} />
              </label>
              <label>
                Business category
                <input readOnly value={business?.category || ''} />
              </label>
              <label className="wide">
                Description
                <textarea readOnly value={business?.description || ''} placeholder="A short line about your business." />
              </label>
              <label>
                Phone number
                <input readOnly value={business?.phone || ''} placeholder="Not added yet" />
              </label>
              <label>
                WhatsApp number
                <input readOnly value={business?.phone || ''} placeholder="Not added yet" />
              </label>
              <label className="wide">
                Store URL
                <div className="url-input">
                  <span>cove.store/shop/</span>
                  <input readOnly value={business?.slug || ''} />
                </div>
              </label>
            </div>
          </section>
        ) : (
          <section className="card settings-form">
            <div className="form-heading">
              <div>
                <h2>{tab}</h2>
                <p className="muted">This setting will be added in a later step.</p>
              </div>
            </div>
          </section>
        )}
      </section>
    </>
  );
}
