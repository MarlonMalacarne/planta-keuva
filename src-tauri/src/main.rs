// Evita abrir um terminal junto com o app no Windows (no Mac não tem efeito).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    planta_keuva_lib::run()
}
