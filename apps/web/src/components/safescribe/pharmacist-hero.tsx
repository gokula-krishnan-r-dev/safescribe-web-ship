import Image from 'next/image';

export function PharmacistHero() {
  return (
    <div className="ss-pharmacist-visual">
      <span className="ss-hero-ring" aria-hidden />
      <Image
        src="/landing/pharmacist-hero.png"
        alt="Pharmacist using SafeScribe on a laptop"
        width={924}
        height={988}
        sizes="(max-width: 767px) 72vw, (max-width: 1199px) 40vw, 360px"
        priority
        quality={88}
        className="ss-pharmacist-img"
      />
    </div>
  );
}
