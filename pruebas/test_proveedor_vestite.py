"""El piloto toma los mismos talles que muestra el proveedor al abrir cada modelo."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sincronizador"))
from proveedores.vestite_api import visible_variants  # noqa: E402


def v(size, color, stock):
    return {"size": size, "color": color, "stockDisponible": stock}


class TallesVisibles(unittest.TestCase):
    def test_con_color_de_verdad_se_ignoran_los_sin_color(self):
        variants = [v("40", "SIN COLOR", 4), v("41", "SIN COLOR", 3), v("44", "Único", 1)]
        self.assertEqual([x["size"] for x in visible_variants(variants)], ["44"])

    def test_si_todos_son_sin_color_se_muestran_todos(self):
        variants = [v("40", "SIN COLOR", 4), v("41", "sin color ", 3)]
        self.assertEqual(len(visible_variants(variants)), 2)

    def test_varios_colores_de_verdad_se_muestran_todos(self):
        variants = [v("40", "Negro", 1), v("41", "Blanco", 2), v("42", "", 5)]
        self.assertEqual([x["size"] for x in visible_variants(variants)], ["40", "41"])


if __name__ == "__main__":
    unittest.main()
