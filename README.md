# AYTES Subagent'ları — Kurulum

Bu 5 dosya **Claude Code** için yazıldı (claude.ai sohbeti değil — bilgisayarındaki terminalde çalışan CLI aracı). Skiller (`.skill` dosyaları, Capabilities'e yüklediğin) ile karıştırma; bunlar tamamen farklı bir mekanizma:

- **Skill** → claude.ai/Cowork üzerinden yüklenir, "bilgi paketi" gibi çalışır.
- **Subagent** → senin proje klasörünün içine, dosya olarak konur. Sadece Claude Code (CLI) bunları okur.

## Kurulum

1. AYTES proje klasörünün (örn. `next-app/`) içinde `.claude/agents/` klasörü oluştur (yoksa):
   ```bash
   mkdir -p .claude/agents
   ```
2. Bu 5 `.md` dosyasını (`admin-agent.md`, `frontend-agent.md`, `backend-agent.md`, `test-agent.md`, `security-agent.md`) o klasörün içine kopyala.
3. Claude Code'u proje klasöründe başlat (`claude` komutu). Otomatik olarak bu agent'ları tanıyacak.

## Nasıl kullanılır

**Otomatik**: Normal bir istek yazdığında (örn. "talepler sayfasına filtre ekle") Claude Code, isteğin frontend-agent'a uyduğunu görüp otomatik delege edebilir.

**Manuel/açık çağırma** (daha güvenilir, özellikle başlarken önerilir):
```
backend-agent'ı kullanarak requests tablosuna "cancelled" durumu ekle
```
```
admin-agent'ı kullanarak: talepler sayfasına dosya eki yükleme özelliği ekle — gerekli backend/frontend/test/security adımlarını planla ve uygula
```
```
security-agent'ı kullanarak son değişiklikleri denetle
```

## Önerilen ilk adım

Küçük, tek-agent'lı bir görevle test et (örn. sadece `security-agent`'a mevcut RLS durumunu denetlettir) — agent'ın beklediğin gibi çalıştığını gördükten sonra `admin-agent` ile çok parçalı görevlere geç.

## Not

`admin-agent` içindeki `Task` aracı, kendisinin diğer agent'ları çağırabilmesini sağlamaya çalışır (nested subagent delegasyonu). Kullandığın Claude Code sürümü bunu desteklemiyorsa, admin-agent sana net bir görev listesi verecek — o listedeki agent'ları sen sırayla manuel çağırırsın.
