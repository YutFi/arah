import type { Maneuver } from "./route";

/**
 * Turn-by-turn text in Bahasa Melayu.
 *
 * The routing server has no Malay, so we build the sentence ourselves from the
 * manoeuvre type (which the server does give us) and the road name. Road names
 * are shown exactly as mapped.
 */
type M = Pick<Maneuver, "type" | "streetNames" | "roundaboutExitCount">;

const ORDINAL = ["", "pertama", "kedua", "ketiga", "keempat", "kelima", "keenam", "ketujuh", "kelapan"];

export function malayInstruction(m: M): string {
  const road = m.streetNames[0];
  const to = road ? ` ke ${road}` : "";
  const onto = road ? ` ke ${road}` : "";
  switch (m.type) {
    case 1:
    case 2:
    case 3:
      return road ? `Mula memandu ke ${road}.` : "Mula memandu.";
    case 4:
      return "Anda telah sampai di destinasi.";
    case 5:
      return "Anda telah sampai di destinasi, di sebelah kanan.";
    case 6:
      return "Anda telah sampai di destinasi, di sebelah kiri.";
    case 7:
    case 8:
      return road ? `Teruskan ke ${road}.` : "Teruskan perjalanan.";
    case 9:
      return `Belok sedikit ke kanan${onto}.`;
    case 10:
      return `Belok kanan${onto}.`;
    case 11:
      return `Belok tajam ke kanan${onto}.`;
    case 12:
      return "Buat pusingan U ke kanan.";
    case 13:
      return "Buat pusingan U ke kiri.";
    case 14:
      return `Belok tajam ke kiri${onto}.`;
    case 15:
      return `Belok kiri${onto}.`;
    case 16:
      return `Belok sedikit ke kiri${onto}.`;
    case 17:
      return `Teruskan lurus di jalan susur${to}.`;
    case 18:
      return `Ambil jalan susur di sebelah kanan${to}.`;
    case 19:
      return `Ambil jalan susur di sebelah kiri${to}.`;
    case 20:
      return `Ambil susur keluar di sebelah kanan${to}.`;
    case 21:
      return `Ambil susur keluar di sebelah kiri${to}.`;
    case 22:
      return `Kekal lurus${to}.`;
    case 23:
      return `Kekal di sebelah kanan${to}.`;
    case 24:
      return `Kekal di sebelah kiri${to}.`;
    case 25:
      return `Bergabung${onto}.`;
    case 37:
      return `Bergabung ke lorong kanan${onto}.`;
    case 38:
      return `Bergabung ke lorong kiri${onto}.`;
    case 26: {
      const n = m.roundaboutExitCount ?? 0;
      const exit = n >= 1 && n <= 8 ? ` dan ambil susur keluar ${ORDINAL[n]}` : "";
      return `Masuk bulatan${exit}${onto}.`;
    }
    case 27:
      return `Keluar dari bulatan${onto}.`;
    case 28:
      return "Naik feri.";
    case 29:
      return "Turun dari feri.";
    default:
      return road ? `Teruskan ke ${road}.` : "Teruskan perjalanan.";
  }
}
