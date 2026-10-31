class DonationLink {
  final String name;
  final String url;
  final String note;
  const DonationLink(this.name, this.url, this.note);
}

/// Semua teks identitas dan link ada di sini. Ganti sesuai punyamu.
class AppInfo {
  static const appName = 'ArupijiPlay';
  static const developerName = 'Arupiji App';
  static const appBio =
      'ArupijiPlay adalah aplikasi laucher game RPG Maker yang bisa dimainkan di android dengan gratis tanpa dipungut biaya.';
  static const contactEmail = 'arupijiappdev@gmail.com';
  static const dukungkami = 'Kalian bisa dukung kami lewat donasi sesuai dengan kemampuan kalian dibawah ini, dan kami tidak memaksa kalian untuk berdonasi, namun jika kalian tertarik untuk berdonasi silahkan berdonasi sesuai dengan kemampuan kalian'

  static const donations = <DonationLink>[
    DonationLink('Trakteer', 'https://trakteer.id/username', 'Traktir kopi lewat Trakteer'),
    DonationLink('Saweria', 'https://saweria.co/username', 'Dukung lewat Saweria'),
    DonationLink('Ko-fi', 'https://ko-fi.com/username', 'Untuk dukungan dari luar negeri'),
  ];

  /// Taruh gambar QRIS di assets/images/qris.png, otomatis tampil kalau ada.
  static const qrisAsset = 'assets/images/qris.png';
}
