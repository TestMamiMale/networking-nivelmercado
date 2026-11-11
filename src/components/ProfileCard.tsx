import Image from "next/image";
import Link from "next/link";
import type { ProfileType } from "@/types";

interface ProfileCardProps {
  id: string;
  name: string;
  type: ProfileType;
  description: string;
  imageUrl?: string | null;
}

export default function ProfileCard({
  id,
  name,
  type,
  description,
  imageUrl,
}: ProfileCardProps) {
  return (
    <Link
      href={`/perfil/${id}`}
      className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="relative h-48 w-full">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`Imagen de ${name}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
            <span className="text-4xl font-bold text-white">
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{name}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {type === "indie" ? "Desarrollador Indie" : "Publisher"}
        </p>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3">
          {description}
        </p>
      </div>
    </Link>
  );
}
