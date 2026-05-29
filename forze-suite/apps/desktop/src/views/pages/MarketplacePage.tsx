import { useState } from 'react';
import { Search, ShoppingBag, Star, Tag } from 'lucide-react';
import { marketCategories, marketItems } from '../../workbench/appData';
import { toast } from '../../shell/toast';

export default function MarketplacePage(): JSX.Element {
  const [cat, setCat] = useState('All');
  const items = cat === 'All' ? marketItems : marketItems.filter((i) => i.category === cat);

  return (
    <div className="apppage">
      <div className="apppage__header">
        <div>
          <h1 className="apppage__title">
            <ShoppingBag size={20} strokeWidth={1.8} /> Marketplace
          </h1>
          <p className="apppage__subtitle">
            Buy and sell components, kits, AI workflows, prompts, and plugins.
          </p>
        </div>
        <button
          className="btn-outline"
          type="button"
          onClick={() => toast('Opening the seller submission flow…')}
        >
          <Tag size={15} /> Sell on Marketplace
        </button>
      </div>

      <div className="apppage__body">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 300 }}>
            <Search size={15} color="var(--color-text-dim)" style={{ position: 'absolute', left: 10 }} />
            <input placeholder="Search the marketplace…" style={{ width: '100%', paddingLeft: 32 }} />
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {marketCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cat === c ? 'pill pill--accent' : 'pill'}
                style={{ cursor: 'pointer' }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-auto">
          {items.map((item) => (
            <div className="appcard" key={item.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div className="thumb" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--color-border)' }}>
                {item.category}
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-md)' }}>{item.name}</div>
                    <div className="dim">{item.author}</div>
                  </div>
                  <div style={{ color: item.price === 'Free' ? 'var(--color-ok)' : 'var(--color-text)', fontWeight: 500 }}>
                    {item.price === 'Free' ? 'Free' : `$${item.price}`}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Star size={12} color="var(--color-warn)" /> {item.rating}
                  </span>
                  <span>{item.downloads} downloads</span>
                </div>
                <button
                  className="btn-accent"
                  type="button"
                  style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                  onClick={() => toast(`Installing “${item.name}”…`, 'success')}
                >
                  {item.price === 'Free' ? 'Install' : 'Buy & install'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
