"""El piloto toma los mismos talles que muestra el proveedor al abrir cada modelo."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sincronizador"))
from proveedores.vestite_api import visible_variants  # noqa: E402


def v(size, color, stock):
    return {"size": size, "color": color, "stockDisponible": stock}


class TallesVisibles(unittest.TestCase):
    def test_con_color_de_verdad_se_ignoran_los_de_relleno(self):
        variants = [v("40", "SIN COLOR", 4), v("41", "Único", 3), v("44", "Negro", 1)]
        self.assertEqual([x["size"] for x in visible_variants(variants)], ["44"])

    def test_sin_color_y_unico_son_relleno_y_se_muestran_todos(self):
        # Caso real del 12/10 (Super star blancas): el proveedor muestra 35, 37, 39, 42, 43 y 44.
        variants = [v("37", "SIN COLOR", 1), v("43", "SIN COLOR", 4), v("44", "Único", 1), v("45", "UNICO", 2)]
        self.assertEqual([x["size"] for x in visible_variants(variants)], ["37", "43", "44", "45"])

    def test_si_todos_son_sin_color_se_muestran_todos(self):
        variants = [v("40", "SIN COLOR", 4), v("41", "sin color ", 3)]
        self.assertEqual(len(visible_variants(variants)), 2)

    def test_varios_colores_de_verdad_se_muestran_todos(self):
        variants = [v("40", "Negro", 1), v("41", "Blanco", 2), v("42", "", 5)]
        self.assertEqual([x["size"] for x in visible_variants(variants)], ["40", "41"])


if __name__ == "__main__":
    unittest.main()
