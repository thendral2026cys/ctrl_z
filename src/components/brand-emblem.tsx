import Image from "next/image";

export function BrandEmblem() {
  return (
    <Image
      alt=""
      className="brand-emblem"
      height={768}
      priority
      src="/ctrl-z-logo.png"
      width={768}
    />
  );
}
