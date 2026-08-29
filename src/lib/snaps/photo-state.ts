type SlottedPhoto = {
  slot: number
}

type UpdateSnapPhotosResult<Photo extends SlottedPhoto> =
  { photos: Photo[]; status: 'updated' } | { status: 'missing_retake_target' | 'occupied_without_retake' }

export const updateSnapPhotos = <Photo extends SlottedPhoto>(
  photos: readonly Photo[],
  photo: Photo,
  isRetake: boolean
): UpdateSnapPhotosResult<Photo> => {
  const hasExistingPhoto = photos.some((savedPhoto) => savedPhoto.slot === photo.slot)

  if (hasExistingPhoto && !isRetake) {
    return { status: 'occupied_without_retake' }
  }

  if (!hasExistingPhoto && isRetake) {
    return { status: 'missing_retake_target' }
  }

  return {
    photos: [...photos.filter((savedPhoto) => savedPhoto.slot !== photo.slot), photo].sort(
      (first, second) => first.slot - second.slot
    ),
    status: 'updated'
  }
}
