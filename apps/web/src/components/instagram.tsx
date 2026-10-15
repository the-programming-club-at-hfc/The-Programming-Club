import { QRCodeSVG } from "qrcode.react";
import { CLUB, INSTAGRAM_URL } from "#/lib/season";

/** A camera outline in Instagram's shape, drawn in currentColor. */
export const InstagramGlyph = ({ className = "size-[1.15em]" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

/** "Follow @hfc.codes", opening the club's Instagram profile. */
export function InstagramLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 font-semibold ${className}`}
    >
      <InstagramGlyph />
      Follow @{CLUB.instagram}
    </a>
  );
}

/**
 * The TV's Instagram card, for breaks and the end of the night, never while people are joining (the join QR owns that).
 * A standard QR of the profile link, black on white with a full quiet zone so phone cameras read it from across the room.
 */
export function InstagramQr({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={`${compact ? "w-[16vw]" : "w-[19vw]"} bg-[linear-gradient(135deg,#d62976,#962fbf_55%,#4f5bd5)] p-[1.2vw] text-white ${className}`}
    >
      <p
        className={`flex items-center gap-[0.5vw] leading-tight font-extrabold whitespace-nowrap ${compact ? "text-[1.1vw]" : "text-[1.35vw]"}`}
      >
        <InstagramGlyph className="size-[1.8vw]" />
        Follow @{CLUB.instagram}
      </p>
      <QRCodeSVG
        value={INSTAGRAM_URL}
        title={`Scan to follow @${CLUB.instagram} on Instagram`}
        size={512}
        marginSize={4}
        className="mt-[1vw] h-auto w-full"
      />
      <p className={`mt-[0.9vw] leading-snug ${compact ? "text-[1vw]" : "text-[1.15vw]"}`}>Like, share, and tag us in your club photos.</p>
    </div>
  );
}
