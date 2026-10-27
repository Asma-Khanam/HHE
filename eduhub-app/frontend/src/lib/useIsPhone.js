import { useEffect, useState } from "react";

// True on phone-sized screens (same cut-off as the phone CSS: 820px).
export default function useIsPhone() {
  const query = "(max-width: 820px)";
  const get = () => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const [isPhone, setIsPhone] = useState(get);
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(query);
    } catch {
      return undefined;
    }
    const onChange = () => setIsPhone(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return isPhone;
}
