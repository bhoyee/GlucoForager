// components/KeyboardAwareScrollView.js
// A ScrollView that keeps the text box you're typing in above the keyboard.
//
// With Android edge-to-edge (app.json edgeToEdgeEnabled) the window no longer shrinks when the
// keyboard opens, so the keyboard simply covers whatever is near the bottom. This adds the
// keyboard's height as extra space at the bottom and scrolls the focused input into view -
// also when you move between inputs while the keyboard stays open. Plain JS (OTA-safe).
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';

const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  { contentContainerStyle, children, extraOffset = 140, onTouchEnd, ...rest },
  ref
) {
  const scrollRef = useRef(null);
  const keyboardRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const setRefs = useCallback(
    (node) => {
      scrollRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  // Put the focused input roughly a third of the way down the visible area.
  const scrollToFocused = useCallback(() => {
    const input = TextInput.State?.currentlyFocusedInput?.();
    const scroll = scrollRef.current;
    const inner = scroll?.getInnerViewRef?.();
    if (!input || !inner || typeof input.measureLayout !== 'function') return;
    try {
      input.measureLayout(
        inner,
        (_x, y) => scroll.scrollTo({ y: Math.max(0, y - extraOffset), animated: true }),
        () => {}
      );
    } catch {
      // The input isn't inside this scroll view (e.g. a modal) - nothing to do.
    }
  }, [extraOffset]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      const height = e?.endCoordinates?.height || 0;
      keyboardRef.current = height;
      setKeyboardHeight(height);
      // Wait a frame so the extra bottom space exists before scrolling into it.
      setTimeout(scrollToFocused, Platform.OS === 'ios' ? 50 : 80);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardRef.current = 0;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollToFocused]);

  return (
    <ScrollView
      ref={setRefs}
      keyboardShouldPersistTaps="handled"
      {...rest}
      contentContainerStyle={[contentContainerStyle, keyboardHeight ? { paddingBottom: keyboardHeight + 32 } : null]}
      onTouchEnd={(e) => {
        // Tapping another input while the keyboard is already open: bring that one into view too.
        if (keyboardRef.current) setTimeout(scrollToFocused, 250);
        onTouchEnd?.(e);
      }}
    >
      {children}
    </ScrollView>
  );
});

export default KeyboardAwareScrollView;
