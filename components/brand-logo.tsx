import Image from "next/image";

export function BrandLogo() {
  return <Image className="brand-mark" src="/brand/ngapaya-logo.png" alt="Logo Ngapaya" width={36} height={36} sizes="36px" loading="eager" />;
}
