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
 * `row` lays it out as a strip, QR beside the words, to sit under other text (the attract screen).
 */
export function InstagramQr({ className = "", row = false }: { className?: string; row?: boolean }) {
  const qr = (
    <QRCodeSVG
      value={INSTAGRAM_URL}
      title={`Scan to follow @${CLUB.instagram} on Instagram`}
      size={512}
      marginSize={4}
      className={row ? "h-auto w-[9vw] shrink-0" : "mt-[1vw] h-auto w-full"}
    />
  );
  const follow = (
    <p className="flex items-center gap-[0.5vw] text-[1.35vw] leading-tight font-extrabold whitespace-nowrap">
      <InstagramGlyph className="size-[1.8vw]" />
      Follow @{CLUB.instagram}
    </p>
  );
  const tag = (
    <p className={`leading-snug ${row ? "mt-[0.6vw] max-w-[16em] text-[1.15vw]" : "mt-[0.9vw] text-[1.15vw]"}`}>
      Like, share, and tag us in your club photos.
    </p>
  );
  return (
    <div
      className={`bg-[linear-gradient(135deg,#d62976,#962fbf_55%,#4f5bd5)] text-white ${row ? "inline-flex items-center gap-[1.4vw] p-[0.9vw] pr-[1.8vw]" : "w-[19vw] p-[1.2vw]"} ${className}`}
    >
      {row ? (
        <>
          {qr}
          <div>
            {follow}
            {tag}
          </div>
        </>
      ) : (
        <>
          {follow}
          {qr}
          {tag}
        </>
      )}
    </div>
  );
}
