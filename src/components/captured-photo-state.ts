type IndexedPhoto = {
  id: string
  index: number
}

export const upsertCapturedPhoto = <Photo extends IndexedPhoto>(photos: readonly Photo[], photo: Photo): Photo[] =>
  [...photos.filter((candidate) => candidate.index !== photo.index), photo].sort(
    (first, second) => first.index - second.index
  )

export const replaceCapturedPhoto = <Photo extends IndexedPhoto>(
  photos: readonly Photo[],
  photoId: string,
  replacement: Photo
): Photo[] => photos.map((photo) => (photo.id === photoId ? replacement : photo))
