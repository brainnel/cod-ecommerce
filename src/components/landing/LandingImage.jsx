import { useState } from 'react'
import { pickLandingImageSrc } from '../../utils/landingImageOptimization'

// An <img> that tries `optimizedSrc` first and, if that file fails to load, shows
// `src` (the stored original) instead. It falls back once: the error handler is
// only attached while the optimized URL is shown.
const LandingImage = ({ src, optimizedSrc, alt, ...imgProps }) => {
  const [failedSrc, setFailedSrc] = useState(null)
  const shownSrc = pickLandingImageSrc({ src, optimizedSrc, failedSrc })

  return (
    <img
      {...imgProps}
      src={shownSrc}
      alt={alt}
      onError={shownSrc === src ? undefined : () => setFailedSrc(optimizedSrc)}
    />
  )
}

export default LandingImage
