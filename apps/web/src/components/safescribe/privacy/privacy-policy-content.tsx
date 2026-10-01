import { privacyPolicySections } from '@/content/legal/privacy-policy';
import { privacyPolicyMeta } from '@/content/legal/privacy-policy-metadata';

export function PrivacyPolicyContent() {
  return (
    <div className="ss-privacy-content">
      <header className="ss-privacy-content-head">
        <p className="ss-about-eyebrow">Privacy &amp; Security Policy</p>
        <h2>The full policy</h2>
        <ul className="ss-privacy-facts">
          <li>Effective {privacyPolicyMeta.lastUpdatedLabel}</li>
          <li>{privacyPolicyMeta.organization}</li>
          <li>{privacyPolicyMeta.location}</li>
        </ul>
      </header>

      {privacyPolicySections.map((section, index) => (
        <article key={section.id} id={section.id} className="ss-privacy-article">
          <h3>
            <span>{index + 1}.</span> {section.title}
          </h3>
          {section.blocks.map((block, blockIndex) => {
            if (block.type === 'p') {
              return <p key={blockIndex}>{block.text}</p>;
            }
            if (block.type === 'ul') {
              return (
                <ul key={blockIndex}>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <aside key={blockIndex} className="ss-privacy-callout">
                <p className="ss-privacy-callout-title">{block.title}</p>
                <p>{block.text}</p>
              </aside>
            );
          })}
        </article>
      ))}
    </div>
  );
}
