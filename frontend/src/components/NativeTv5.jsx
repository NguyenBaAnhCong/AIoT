import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Compatibility redirect for bookmarked group routes. TV5 renders in native browser JavaScript.
export default function NativeTv5() {
  const { pathname } = useLocation();
  const screen = pathname.split('/')[1];
  const href = '/tv5/' + screen;
  useEffect(() => { window.location.replace(href); }, [href]);
  return <a href={href}>Mở trang TV5</a>;
}
