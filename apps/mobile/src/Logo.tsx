import { Image } from 'expo-image';
import logo from '../../../assets/brand/eventra-logo-v5.svg';
import icon from '../../../assets/brand/eventra-icon.svg';

/** Logo penuh (rasio 760:190); warna asli, letakkan di surface terang. */
export function Logo({ height = 40 }: { height?: number }) {
  return <Image source={logo} contentFit="contain" style={{ height, aspectRatio: 4 }} />;
}

/** Mark kotak untuk indikator loading dan ruang sempit. */
export function LogoIcon({ size = 40 }: { size?: number }) {
  return <Image source={icon} contentFit="contain" style={{ width: size, height: size }} />;
}
