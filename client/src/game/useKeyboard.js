import { useEffect, useRef } from 'react';

const BINDINGS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
};

// Returns a ref whose .current always reflects held keys — read it inside
// useFrame without re-rendering React.
export function useKeyboard() {
  const keys = useRef({ forward: false, back: false, left: false, right: false, jump: false });

  useEffect(() => {
    const onKey = (down) => (e) => {
      const action = BINDINGS[e.code];
      if (action) {
        keys.current[action] = down;
        if (e.code === 'Space') e.preventDefault();
      }
    };
    const keyDown = onKey(true);
    const keyUp = onKey(false);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
  }, []);

  return keys;
}
