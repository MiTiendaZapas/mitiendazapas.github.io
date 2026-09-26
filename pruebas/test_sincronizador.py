"""Pruebas automáticas del sincronizador de catálogo (no usan internet).

Correr desde la carpeta plataforma-zapas:   python -m unittest discover pruebas
"""
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sincronizador"))

import manual_stock  # noqa: E402
import settings  # noqa: E402
from classify import Classifier, clean_name, normalize, slugify  # noqa: E402
from images import ImageStore  # noqa: E402
from sync_catalog import build_products  # noqa: E402


class TestNombres(unittest.TestCase):
    def test_normalize_iguala_variantes_del_mismo_nombre(self):
        self.assertEqual(normalize("Air forcé 1  blancas"), normalize("air force 1 blancas"))
        self.assertEqual(normalize("NB 530 blanca /negro"), "nb 530 blanca/negro")

    def test_clean_name_y_slug(self):
        self.assertEqual(clean_name("NB 530 blanca/negro"), "NB 530 blanca / negro")
        self.assertEqual(slugify("Jordan 1 café flamingo"), "jordan-1-cafe-flamingo")


class TestClasificacion(unittest.TestCase):
    def setUp(self):
        self.c = Classifier()

    def test_marcas_por_familia_de_modelo(self):
        self.assertEqual(self.c.brand("Sb dunk gris"), "Nike")
        self.assertEqual(self.c.brand("Jordan retro 4 RED"), "Jordan")
        self.assertEqual(self.c.brand("Súper star brillo"), "Adidas")
        self.assertEqual(self.c.brand("Nb 9060 black"), "New Balance")
        self.assertEqual(self.c.brand("Mind beige"), "Nike")

    def test_marca_del_proveedor_se_lleva_al_nombre_oficial(self):
        self.assertEqual(self.c.brand("ABZORB marrones", "New balance"), "New Balance")
        self.assertEqual(self.c.brand("Algo", "reebok"), "Reebok")

    def test_palabra_completa_no_parcial(self):
        # "fila" es marca, pero no debe coincidir dentro de otra palabra
        self.assertIsNone(self.c.brand("Zapatilla filamento"))

    def test_sin_marca_clara_queda_para_revisar(self):
        self.assertIsNone(self.c.brand("Modelo desconocido xyz"))

    def test_categorias(self):
        self.assertEqual(self.c.category("Ojotas total black", []), "ojotas")
        self.assertEqual(self.c.category("Mind beige", []), "ojotas")
        self.assertEqual(self.c.category("Algo", [{"size": "37/38", "stock": 1}]), "ojotas")
        self.assertEqual(self.c.category("Botitas Jordan niño", []), "ninos")
        self.assertEqual(self.c.category("Panda sb dunk", [{"size": "40", "stock": 1}]), "zapatillas")


class TestFusionConStockDeCasa(unittest.TestCase):
    def setUp(self):
        self.provider = [
            {"ref": "tn-1", "name": "Air forcé 1 blancas", "sizes": [{"size": "40", "stock": 3}, {"size": "41", "stock": 0}]},
            {"ref": "tn-2", "name": "Panda sb dunk", "sizes": [{"size": "38", "stock": 0}]},     # sin stock
            {"ref": "tn-3", "name": "Remera Adidas", "sizes": [{"size": "M", "stock": 5}]},      # indumentaria: se excluye
        ]
        self.manual = [
            ("zapatillas", {"name": "Air force 1 blancas", "sizes": [{"size": "40", "stock": 2}, {"size": "38", "stock": 1}], "photo": "Fotos/x.jpeg"}),
            ("zapatillas", {"name": "Jordan charol azul", "sizes": [{"size": "42", "stock": 2}], "photo": "Fotos/y.jpeg"}),
        ]
        self.products = {p["name"]: p for p in build_products(self.provider, self.manual, Classifier())}

    def test_mismo_modelo_se_fusiona_aunque_varie_la_tilde(self):
        af = self.products["Air forcé 1 blancas"]
        self.assertEqual(af["id"], "tn-1")                       # usa el id del proveedor
        self.assertEqual(af["origin"], ["casa", "proveedor"])
        sizes = {s["size"]: s for s in af["sizes"]}
        self.assertEqual(sizes["40"], {"size": "40", "stock": 5, "casa": 2})   # 3 del proveedor + 2 de casa
        self.assertEqual(sizes["38"], {"size": "38", "stock": 1, "casa": 1})
        self.assertEqual(sizes["41"], {"size": "41", "stock": 0})

    def test_modelos_sin_stock_e_indumentaria_del_proveedor_no_entran(self):
        self.assertNotIn("Panda sb dunk", self.products)
        self.assertNotIn("Remera Adidas", self.products)

    def test_modelo_solo_de_casa(self):
        jordan = self.products["Jordan charol azul"]
        self.assertEqual(jordan["id"], "casa-jordan-charol-azul")
        self.assertEqual(jordan["origin"], ["casa"])

    def test_talles_ordenados_numericamente(self):
        af = self.products["Air forcé 1 blancas"]
        self.assertEqual([s["size"] for s in af["sizes"]], ["38", "40", "41"])


class TestStockManual(unittest.TestCase):
    def test_lee_el_formato_del_panel_admin(self):
        with tempfile.TemporaryDirectory() as folder:
            js = Path(folder) / "zapatillas_manual.js"
            js.write_text(
                "const stock_zapatillas_manual = [\n"
                "    { modelo: 'Ojotas Louis Vuitton negras', talles: [{\"talle\": \"37/38\", \"stock\": 1}], foto: 'Fotos/a.jpeg' },\n"
                "    { modelo: 'D\\'Angelo 1', talles: [{\"talle\": 40, \"stock\": 2}], foto: 'Fotos/b.jpeg' },\n"
                "];\n", encoding="utf-8")
            original = settings.MANUAL_STOCK_FILES
            settings.MANUAL_STOCK_FILES = {"zapatillas": js}
            try:
                items = manual_stock.load()
            finally:
                settings.MANUAL_STOCK_FILES = original
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0][1]["sizes"], [{"size": "37/38", "stock": 1}])
        self.assertEqual(items[1][1]["name"], "D'Angelo 1")   # comillas escapadas bien leídas

    def test_si_falta_el_archivo_frena_en_vez_de_perder_stock(self):
        original = settings.MANUAL_STOCK_FILES
        settings.MANUAL_STOCK_FILES = {"zapatillas": Path("C:/no-existe/zapatillas_manual.js")}
        try:
            with self.assertRaises(RuntimeError):
                manual_stock.load()
        finally:
            settings.MANUAL_STOCK_FILES = original


class TestReutilizarFotos(unittest.TestCase):
    def test_modelo_sin_fotos_reutiliza_las_del_mismo_nombre(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmp:
            original = (settings.CATALOG_DIR, settings.IMAGES_DIR)
            settings.CATALOG_DIR = Path(tmp)
            settings.IMAGES_DIR = Path(tmp) / "fotos"
            try:
                old = settings.IMAGES_DIR / "tn-1"
                old.mkdir(parents=True)
                Image.new("RGB", (30, 40)).save(old / "a-lg.webp", "WEBP")
                Image.new("RGB", (15, 20)).save(old / "a-sm.webp", "WEBP")
                store = ImageStore.__new__(ImageStore)
                store.state = {"tn-1": {"sources": ["x"], "name_key": "shox gris",
                                        "images": [{"lg": "fotos/tn-1/a-lg.webp", "sm": "fotos/tn-1/a-sm.webp", "w": 30, "h": 40}]}}
                images = store.reuse_by_name("vp-9", "shox gris")
                self.assertEqual(images[0]["lg"], "fotos/vp-9/a-lg.webp")
                self.assertTrue((settings.IMAGES_DIR / "vp-9" / "a-sm.webp").exists())
                self.assertTrue(store.needs_check("vp-9"))   # se sigue revisando por si el proveedor carga las suyas
                self.assertEqual(store.reuse_by_name("vp-10", "otro modelo"), [])
            finally:
                settings.CATALOG_DIR, settings.IMAGES_DIR = original


class TestCarpetaFotos(unittest.TestCase):
    def test_encuentra_la_foto_por_nombre_de_modelo(self):
        import sync_catalog
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "Fotos").mkdir()
            (Path(tmp) / "Fotos" / "Shox tapón azul.jpeg").write_bytes(b"x")
            (Path(tmp) / "Fotos" / "Sb dunk cinza preto.webp").write_bytes(b"x")
            original = settings.LEGACY_PHOTOS_DIR
            settings.LEGACY_PHOTOS_DIR = Path(tmp)
            try:
                index = sync_catalog._photos_folder_index()
            finally:
                settings.LEGACY_PHOTOS_DIR = original
        self.assertIn(normalize("Shox tapon azul"), index)
        self.assertIn(normalize("Sb dunk cinza / preto".replace("/", " ")), index)


class TestImagenes(unittest.TestCase):
    def test_respuesta_que_no_es_imagen_se_rechaza(self):
        with self.assertRaises(Exception):
            ImageStore._open_as_rgb(b"<html>Error 503</html>")

    def test_imagen_valida_se_convierte(self):
        from PIL import Image
        buffer = io.BytesIO()
        Image.new("RGBA", (40, 50), (255, 0, 0, 128)).save(buffer, "PNG")
        self.assertEqual(ImageStore._open_as_rgb(buffer.getvalue()).mode, "RGB")


if __name__ == "__main__":
    unittest.main()
