import type { JsonLdObject } from '../../seo/schema';

/** Renders Schema.org JSON-LD safely in SSR HTML with closing-tag breakout escaping. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, idx) => {
        const safeJson = JSON.stringify(item).replace(/</g, '\\u003c');
        return (
          <script
            key={idx}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJson }}
          />
        );
      })}
    </>
  );
}
