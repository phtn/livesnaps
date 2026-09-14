type IndexedPhoto = {
  id: string
  index: number
}

type UploadTrackedPhoto = IndexedPhoto & {
  uploadStatus: 'saved' | 'saving' | 'failed'
}

export const getCaptureProgressCount = <Photo extends UploadTrackedPhoto>(photos: readonly Photo[]): number =>
  photos.filter((photo) => photo.uploadStatus !== 'failed').length

export const upsertCapturedPhoto = <Photo extends IndexedPhoto>(photos: readonly Photo[], photo: Photo): Photo[] =>
  [...photos.filter((candidate) => candidate.index !== photo.index), photo].sort(
    (first, second) => first.index - second.index
  )

export const replaceCapturedPhoto = <Photo extends IndexedPhoto>(
  photos: readonly Photo[],
  photoId: string,
  replacement: Photo
): Photo[] => photos.map((photo) => (photo.id === photoId ? replacement : photo))
