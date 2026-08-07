import { useCallback, useEffect, useMemo } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Image as ExpoImage, type ImageLoadEventData } from "expo-image";
import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  type ZoomSurfaceProps,
} from "./zoom-surface.types";

/**
 * iOS/Android zoom surface. Pinch, pan and double tap are built on gesture-handler + reanimated
 * rather than a zoom library: both are already dependencies, they run the transform on the UI
 * thread, and no published RN zoom package tracks the reanimated 4 / worklets versions this app
 * pins.
 *
 * The transform is applied to a wrapper around a fit-to-viewport image, so the clamp only needs the
 * viewport box: a child scaled about its own centre can travel `(scale - 1) * size / 2` before its
 * edge crosses the viewport edge.
 */
export function ZoomSurface({ uri, alt, onError, onZoomedChange, onTap }: ZoomSurfaceProps) {
  const source = useMemo(() => ({ uri }), [uri]);

  const scale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(MIN_SCALE);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const imageWidth = useSharedValue(0);
  const imageHeight = useSharedValue(0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportWidth.value = event.nativeEvent.layout.width;
      viewportHeight.value = event.nativeEvent.layout.height;
    },
    [viewportWidth, viewportHeight],
  );

  // Intrinsic pixel size, needed to know how much of the picture actually overflows the viewport
  // once it has been letterboxed into it.
  const handleImageLoad = useCallback(
    (event: ImageLoadEventData) => {
      imageWidth.value = event.source.width;
      imageHeight.value = event.source.height;
    },
    [imageWidth, imageHeight],
  );

  // A new image starts at fit; shared values outlive the source swap because the lightbox keeps
  // this component mounted and only changes the uri.
  useEffect(() => {
    scale.value = MIN_SCALE;
    translateX.value = 0;
    translateY.value = 0;
    imageWidth.value = 0;
    imageHeight.value = 0;
  }, [uri, scale, translateX, translateY, imageWidth, imageHeight]);

  useAnimatedReaction(
    () => scale.value > MIN_SCALE + ZOOMED_EPSILON,
    (zoomed, previous) => {
      if (previous === null || zoomed === previous || !onZoomedChange) return;
      scheduleOnRN(onZoomedChange, zoomed);
    },
    [onZoomedChange],
  );

  const gesture = useMemo(() => {
    // `contentFit="contain"` letterboxes the picture, so the picture is smaller than the viewport on
    // one axis. Clamping against the viewport would let that axis travel by the letterbox margin on
    // top of the real overflow — a square image on a tall phone could be flung off screen entirely.
    // Bound the travel by the drawn picture instead.
    // Declaration order matters: a worklet captures its closure when it is defined, so a helper
    // referenced before its `const` has been assigned is captured as undefined and blows up on the
    // UI thread rather than at build time.
    const containScale = () => {
      "worklet";
      return Math.min(
        viewportWidth.value / imageWidth.value,
        viewportHeight.value / imageHeight.value,
      );
    };
    const fittedWidth = () => {
      "worklet";
      if (!imageWidth.value || !imageHeight.value) return viewportWidth.value;
      return imageWidth.value * containScale();
    };
    const fittedHeight = () => {
      "worklet";
      if (!imageWidth.value || !imageHeight.value) return viewportHeight.value;
      return imageHeight.value * containScale();
    };
    const maxTranslateX = (nextScale: number) => {
      "worklet";
      return Math.max(0, (fittedWidth() * nextScale - viewportWidth.value) / 2);
    };
    const maxTranslateY = (nextScale: number) => {
      "worklet";
      return Math.max(0, (fittedHeight() * nextScale - viewportHeight.value) / 2);
    };
    const clamp = (value: number, min: number, max: number) => {
      "worklet";
      return Math.min(Math.max(value, min), max);
    };
    const applyTranslate = (x: number, y: number, nextScale: number) => {
      "worklet";
      translateX.value = clamp(x, -maxTranslateX(nextScale), maxTranslateX(nextScale));
      translateY.value = clamp(y, -maxTranslateY(nextScale), maxTranslateY(nextScale));
    };
    const saveStart = () => {
      "worklet";
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    };
    /** Whether a point in viewport coordinates lands on the drawn picture rather than beside it. */
    const isOnPicture = (x: number, y: number) => {
      "worklet";
      const halfWidth = (fittedWidth() * scale.value) / 2;
      const halfHeight = (fittedHeight() * scale.value) / 2;
      return (
        Math.abs(x - (viewportWidth.value / 2 + translateX.value)) <= halfWidth &&
        Math.abs(y - (viewportHeight.value / 2 + translateY.value)) <= halfHeight
      );
    };

    const pinch = Gesture.Pinch()
      .onStart(saveStart)
      .onUpdate((event) => {
        const nextScale = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
        // Keep the content point under the fingers still: with `screen = scale * point + translate`,
        // solving for the new translate at the same focal point gives this ratio form.
        const focalX = event.focalX - viewportWidth.value / 2;
        const focalY = event.focalY - viewportHeight.value / 2;
        const ratio = nextScale / savedScale.value;
        scale.value = nextScale;
        applyTranslate(
          focalX - ratio * (focalX - savedTranslateX.value),
          focalY - ratio * (focalY - savedTranslateY.value),
          nextScale,
        );
      });

    const pan = Gesture.Pan()
      .averageTouches(true)
      .onStart(saveStart)
      .onUpdate((event) => {
        applyTranslate(
          savedTranslateX.value + event.translationX,
          savedTranslateY.value + event.translationY,
          scale.value,
        );
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      // gesture-handler puts no distance limit on a tap by default, so without this a slow drag
      // ends as a tap as well as a pan.
      .maxDistance(TAP_SLOP)
      // Shorter than the 500ms default: a single tap closes the lightbox and has to wait out this
      // window first, and half a second of nothing reads as a dropped tap.
      .maxDelay(250)
      .onEnd((event) => {
        const zoomingIn = scale.value <= MIN_SCALE + ZOOMED_EPSILON;
        const nextScale = zoomingIn ? DOUBLE_TAP_SCALE : MIN_SCALE;
        if (zoomingIn) {
          // Zoom towards the tap rather than the centre, then clamp so the jump cannot leave a gap.
          const focalX = event.x - viewportWidth.value / 2;
          const focalY = event.y - viewportHeight.value / 2;
          const ratio = nextScale / scale.value;
          const targetX = focalX - ratio * (focalX - translateX.value);
          const targetY = focalY - ratio * (focalY - translateY.value);
          translateX.value = withTiming(
            clamp(targetX, -maxTranslateX(nextScale), maxTranslateX(nextScale)),
            TIMING,
          );
          translateY.value = withTiming(
            clamp(targetY, -maxTranslateY(nextScale), maxTranslateY(nextScale)),
            TIMING,
          );
        } else {
          translateX.value = withTiming(0, TIMING);
          translateY.value = withTiming(0, TIMING);
        }
        scale.value = withTiming(nextScale, TIMING);
      });

    // Close-on-tap cannot be left to the backdrop underneath: once a detector owns this area a
    // single tap is consumed here, so the lightbox hands its dismiss down as `onTap`. Only taps
    // beside the picture dismiss — landing on the picture itself is how you look at it, and
    // `contentFit="contain"` usually leaves generous letterbox margins to aim at.
    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .maxDistance(TAP_SLOP)
      .onEnd((event, success) => {
        if (!success || !onTap) return;
        if (isOnPicture(event.x, event.y)) return;
        scheduleOnRN(onTap);
      });

    // Pinch and pan must NOT sit behind the taps in an Exclusive: Exclusive only lets a later
    // gesture start once every earlier one has failed, so both would wait out the double-tap and
    // single-tap timers and only engage after the finger had been held for the better part of a
    // second. They run simultaneously with the taps instead; movement fails the tap recognisers on
    // its own, and Exclusive is left to do the one job it is right for — letting the double tap
    // win over the single tap.
    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [
    imageHeight,
    imageWidth,
    onTap,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
    viewportHeight,
    viewportWidth,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={fillStyle} onLayout={handleLayout} collapsable={false}>
        <Animated.View style={animatedStyle}>
          <ExpoImage
            testID="attachment-lightbox-image"
            accessibilityLabel={alt}
            source={source}
            contentFit="contain"
            onLoad={handleImageLoad}
            onError={onError}
            style={fillStyle}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Scale is float; a pinch that settles on 1.0000001 must not read as zoomed. */
const ZOOMED_EPSILON = 0.01;
/** How far a finger may drift and still count as a tap rather than the start of a pan. */
const TAP_SLOP = 12;
const TIMING = { duration: 180 } as const;

const fillStyle = { flex: 1 } as const;
