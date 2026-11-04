// No treatment content is shown without an explicitly eligible assignment.
export default function ClarityProductHighlights({ copy }) {
  if (!copy) return null
  return <div className="clarity-product-highlights" data-product-clarity="v1">
    <p>{copy.headline}</p>
    <p>{copy.detail}</p>
  </div>
}
