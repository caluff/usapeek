const MAGNIFICATION = 3

type ZoomInput = {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  pointerX: number
  pointerY: number
  availableWidth: number
}

export function getProductImageZoom(input: ZoomInput) {
  const {
    width,
    height,
    naturalWidth,
    naturalHeight,
    pointerX,
    pointerY,
    availableWidth,
  } = input
  if (
    ![width, height, naturalWidth, naturalHeight, availableWidth].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    !Number.isFinite(pointerX) ||
    !Number.isFinite(pointerY)
  )
    return null

  const fit = Math.min(width / naturalWidth, height / naturalHeight)
  const imageWidth = naturalWidth * fit
  const imageHeight = naturalHeight * fit
  const imageLeft = (width - imageWidth) / 2
  const imageTop = (height - imageHeight) / 2
  if (
    pointerX < imageLeft ||
    pointerX > imageLeft + imageWidth ||
    pointerY < imageTop ||
    pointerY > imageTop + imageHeight
  )
    return null

  const previewSize = Math.min(
    availableWidth,
    width,
    height,
    imageWidth * MAGNIFICATION,
    imageHeight * MAGNIFICATION,
  )
  const previewWidth = previewSize
  const previewHeight = previewSize
  const lensWidth = previewWidth / MAGNIFICATION
  const lensHeight = previewHeight / MAGNIFICATION
  const lensX = Math.max(
    0,
    Math.min(imageWidth - lensWidth, pointerX - imageLeft - lensWidth / 2),
  )
  const lensY = Math.max(
    0,
    Math.min(imageHeight - lensHeight, pointerY - imageTop - lensHeight / 2),
  )

  return {
    previewWidth,
    previewHeight,
    lensWidth,
    lensHeight,
    lensLeft: imageLeft + lensX,
    lensTop: imageTop + lensY,
    zoomWidth: imageWidth * MAGNIFICATION,
    zoomHeight: imageHeight * MAGNIFICATION,
    zoomLeft: -lensX * MAGNIFICATION,
    zoomTop: -lensY * MAGNIFICATION,
  }
}
