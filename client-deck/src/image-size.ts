// Reads an image URL's actual pixel dimensions via a hidden (never-mounted)
// <img> load — the crop UI and image-insert control need the *source's* full
// extent to default/scale crop handles against, and the server has no way to
// inspect image bytes itself (design.md's "Add an image" decision), so the
// browser is the one place this can be read.

export function loadNaturalImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}
